import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

import dataVersions from '../src/model/data-versions.json' with { type: 'json' };

export const DEMO_BACKUP_VERSION = dataVersions.backup;
export const DEMO_OUTPUT_RELATIVE_PATH = 'demo/generated/trajectory-full.json';

export function todayKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date, amount) {
  const cursor = parseDate(date);
  cursor.setUTCDate(cursor.getUTCDate() + amount);
  return formatDate(cursor);
}

export function startOfMonth(date) {
  const cursor = parseDate(date);
  cursor.setUTCDate(1);
  return formatDate(cursor);
}

export function addMonths(date, amount) {
  const cursor = parseDate(date);
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() + amount);
  return formatDate(cursor);
}

function careerStatesForDay(index) {
  if (index % 4 === 0) {
    return ['preparation', 'external'];
  }
  if (index % 5 === 0) {
    return ['project', 'external'];
  }
  return [index % 3 === 0 ? 'project' : 'preparation'];
}

function sleepForDay(special, late, index) {
  let sleepMinutes = 440 + (index % 4) * 10;
  if (special?.[0] === 'travel') {
    sleepMinutes = 365;
  } else if (late) {
    sleepMinutes = 390;
  }
  let sleepQuality = 4 + (index % 2);
  if (special) {
    sleepQuality = 2;
  } else if (late) {
    sleepQuality = 3;
  }
  let energy = 4 + (index % 2);
  if (special?.[0] === 'overload') {
    energy = 2;
  } else if (late) {
    energy = 3;
  }
  return { energy, sleepMinutes, sleepQuality };
}

function experimentForDay(date, index, active, completed) {
  if (date >= active.start && date <= active.end) {
    return { completed: index % 4 !== 0, id: active.id };
  }
  if (date >= completed.start && date <= completed.end) {
    return { completed: index % 3 !== 0, id: completed.id };
  }
  return { completed: null, id: null };
}

function experimentNoteForDay(completed, index) {
  if (completed === true) {
    return index % 2 === 0
      ? 'Удалось начать выбранную задачу без уведомлений; помог заранее записанный первый шаг.'
      : 'Начал вовремя, хотя первые минуты хотелось проверить сообщения.';
  }
  return completed === false ? 'Помешал незапланированный звонок, после него было сложно вернуться к выбранной задаче.' : '';
}

function contextNoteForDay(factors, special, index) {
  if (factors.includes('anxiety_overload')) {
    return 'Было сложно переключиться после насыщенного дня';
  }
  return !special && index % 6 === 0 ? 'День с большим количеством встреч' : '';
}

function nutritionStateForDay(index) {
  if (index % 7 === 0) {
    return 'blocks_goal';
  }
  return index % 3 === 0 ? 'neutral' : 'supports_goal';
}

function actionDirectionForDay(careerStates, index) {
  if (careerStates.includes('external')) {
    return 'external';
  }
  return index % 6 === 0 ? 'recovery' : 'preparation';
}

export function buildDemoPayload(anchor = todayKey()) {
  assertDateKey(anchor, 'anchor');

  const currentWeekStart = startOfWeek(anchor);
  const rangeStart = startOfMonth(addMonths(anchor, -3));
  const activeExperimentStart = currentWeekStart;
  const activeExperimentEnd = addDays(activeExperimentStart, 13);
  const activeExperimentId = `experiment-${activeExperimentStart}-notifications`;
  const completedExperimentStart = addDays(currentWeekStart, -35);
  const completedExperimentEnd = addDays(completedExperimentStart, 6);
  const completedExperimentId = `experiment-${completedExperimentStart}-walk`;
  const focusReviewDate = addDays(anchor, 21);

  const trackedDates = eachDate(rangeStart, anchor).filter((date) => {
    const day = parseDate(date).getUTCDay();
    return day === 1 || day === 3 || day === 5 || date >= addDays(anchor, -20);
  });

  const specialDays = new Map([
    [addDays(anchor, -72), ['overload', 'Срочная задача заняла большую часть дня']],
    [addDays(anchor, -46), ['travel', 'Дорога и смена привычного режима']],
    [addDays(anchor, -18), ['recovery', 'Сознательно оставил день без рабочих задач']],
  ]);

  const lifeAreaCycles = [
    ['reading', 'custom:life:music'],
    ['family', 'rest'],
    ['friends', 'rest'],
    ['creativity', 'custom:life:music'],
  ];
  const factorCycles = [[], ['screen'], ['work_code', 'late_bedtime'], ['anxiety_overload'], ['late_food', 'screen']];
  const activityCycles = [['walk'], ['workout'], [], ['walk', 'recovery'], ['recovery']];
  const factCycles = [
    'Отправил черновик организатору встречи',
    'Подобрал примеры для одного раздела доклада',
    'Завершил несколько слайдов презентации',
    'Оставил вечер без рабочих дел',
    'Приготовил ужин вместе с семьёй',
    'Прошёл запланированный маршрут пешком',
  ];

  const dailyEntries = trackedDates.map((date, index) => {
    const factors = factorCycles[index % factorCycles.length];
    const special = specialDays.get(date) ?? null;
    const careerStates = careerStatesForDay(index);
    const late = factors.includes('late_bedtime');
    const { energy, sleepMinutes, sleepQuality } = sleepForDay(special, late, index);
    const experiment = experimentForDay(
      date,
      index,
      { start: activeExperimentStart, end: anchor, id: activeExperimentId },
      { start: completedExperimentStart, end: completedExperimentEnd, id: completedExperimentId },
    );
    const experimentCompleted = experiment.completed;
    const experimentId = experiment.id;
    const experimentNote = experimentNoteForDay(experimentCompleted, index);
    const contextNote = contextNoteForDay(factors, special, index);
    const nutritionState = nutritionStateForDay(index);
    const actionDirection = actionDirectionForDay(careerStates, index);

    return {
      date,
      entrySchemaVersion: dataVersions.dailyEntry,
      activeDailyBlocksSnapshot: ['sleep', 'context', 'career', 'movement', 'nutrition'],
      recordedFields: [
        'bedtime',
        'wakeTime',
        'sleepMinutes',
        'timeInBedMinutes',
        'sleepQuality',
        'energy',
        'contextFactors',
        'careerStates',
        'activities',
        'nutritionState',
        'actionDirection',
        'lifeAreas',
        'importantFact',
        ...(special ? ['specialDay'] : []),
        ...(factors.includes('anxiety_overload') || (!special && index % 6 === 0) ? ['contextNote'] : []),
        ...(index % 7 === 0 ? ['nutritionNote'] : []),
        ...(parseDate(date).getUTCDay() === 1 ? ['weightKg'] : []),
        ...(careerStates.includes('external') ? ['actionNote'] : []),
        ...(experimentCompleted !== null ? ['experimentCompleted', 'experimentNote'] : []),
      ],
      bedtime: late ? '00:35' : ['23:10', '23:30', '23:50'][index % 3],
      wakeTime: special?.[0] === 'travel' ? '06:20' : ['07:20', '07:35', '07:50'][index % 3],
      sleepMinutes,
      timeInBedMinutes: sleepMinutes + 25,
      sleepQuality,
      energy,
      contextFactors: factors,
      contextFactorsRecorded: true,
      contextNote,
      specialDay: special?.[0] ?? null,
      specialDayNote: special?.[1] ?? '',
      careerState: careerStates[0],
      careerStates,
      activities: activityCycles[index % activityCycles.length],
      activitiesRecorded: true,
      nutritionState,
      nutritionNote: index % 7 === 0 ? 'Поздний ужин после насыщенного дня' : '',
      nutritionCriterion: 'Регулярные приёмы пищи без позднего переедания',
      weightKg: parseDate(date).getUTCDay() === 1 ? Number((72.4 + Math.sin(index / 3) * 0.35).toFixed(1)) : null,
      actionDirection,
      actionNote: careerStates.includes('external') ? 'Отправил материал и запросил конкретный комментарий' : '',
      focusTitle: 'Подготовить короткий доклад для профессиональной встречи',
      focusOutcomeCriterion: 'Готовая версия доклада и проведённая репетиция',
      focusReviewDate,
      externalEvidenceCriterion: 'Отправленный черновик, полученный комментарий или назначенная репетиция',
      lifeAreas: lifeAreaCycles[index % lifeAreaCycles.length],
      lifeAreasRecorded: true,
      importantFact: factCycles[index % factCycles.length],
      experimentCompleted,
      experimentId,
      experimentNote,
      updatedAt: isoAt(date, 21),
    };
  });

  const resultTitles = [
    ['career', 'Согласовал тему доклада'],
    ['career', 'Отправил организатору первый черновик'],
    ['custom:life:music', 'Разучил небольшую музыкальную композицию'],
    ['reading', 'Закончил книгу и выписал основные идеи'],
    ['sport', 'Прошёл длинный маршрут пешком'],
    ['family', 'Приготовил семейный ужин'],
    ['creativity', 'Собрал небольшой фотоальбом'],
    ['sleep', 'Три вечера подряд лёг спать вовремя'],
    ['career', 'Получил комментарии к структуре доклада'],
    ['rest', 'Провёл выходной за городом'],
    ['career', 'Провёл первую репетицию выступления'],
    ['friends', 'Встретился с друзьями'],
    ['nutrition', 'Заранее подготовил еду на два дня'],
    ['creativity', 'Сделал визуальный набросок'],
  ];
  const results = trackedDates.slice(-30).map((date, index) => ({
    id: index + 1,
    date,
    area: resultTitles[index % resultTitles.length][0],
    title: resultTitles[index % resultTitles.length][1],
    note: index % 4 === 0 ? 'Короткий контекст результата для проверки длинных карточек и экспорта.' : '',
    createdAt: isoAt(date, 19),
  }));

  const eventSpecs = [
    [-84, 'decision', 'Сократил число параллельных задач', 'Оставил подготовку доклада и обычные домашние дела.'],
    [-72, 'insight', 'Черновик проще отправить в первой половине дня', 'После обеда чаще хотелось ещё раз перепроверить материал.'],
    [-61, 'event', 'Организатор прислал подробные комментарии', 'Зафиксировал правки к структуре и примерам в докладе.'],
    [-46, 'change', 'Поездка изменила режим недели', 'Не сравниваю эту неделю с обычными по сну и нагрузке.'],
    [-34, 'decision', 'Оставил один вечер без подготовки', 'По средам не открываю материалы доклада после 20:00.'],
    [-25, 'insight', 'Экран перед сном связан с более поздним засыпанием', 'Это наблюдение, а не доказанная причина.'],
    [-18, 'event', 'Провёл пробную репетицию', 'Отметил места, где объяснение получилось слишком длинным.'],
    [-7, 'decision', 'Начал эксперимент с первым часом без уведомлений', 'Отмечаю, удалось ли начать задачу без переключений.'],
    [-3, 'change', 'Перенёс переписку на первую половину дня', 'Проверяю, станет ли получение обратной связи регулярнее.'],
    [0, 'other', 'Скорректировал план текущей недели', 'Оставил одну репетицию и финальную проверку материалов.'],
  ];
  const lifeEvents = eventSpecs.map(([offset, type, title, note], index) => {
    const date = addDays(anchor, offset);
    return { id: index + 1, date, type, title, note, createdAt: isoAt(date, 18) };
  });

  const firstReviewWeek = firstMondayOnOrAfter(rangeStart);
  const lastReviewWeek = addDays(currentWeekStart, -7);
  const weekStarts = eachDate(firstReviewWeek, lastReviewWeek).filter((date) => parseDate(date).getUTCDay() === 1);
  const weeklyReviews = weekStarts.map((weekStart, index) => {
    let previousPlanOutcome = 'Основной следующий шаг выполнен';
    if (index === 0) {
      previousPlanOutcome = 'Первый обзор в наборе данных';
    } else if (index % 3 === 0) {
      previousPlanOutcome = 'План сработал частично: материал отправил, вечер перегрузил';
    }
    return {
      weekStart,
      updatedAt: isoAt(addDays(weekStart, 6), 17),
      previousPlanOutcome,
      results: [
        resultTitles[(index * 2) % resultTitles.length][1],
        resultTitles[(index * 2 + 1) % resultTitles.length][1],
        index % 2 === 0 ? 'Сохранил время на восстановление' : '',
      ],
      highlights: [
        index % 2 === 0
          ? 'Заметил, что короткие завершённые шаги легче вспомнить при обзоре'
          : 'Пересмотрел порядок дел после изменения недели',
        index % 3 === 0 ? 'Усталость сильнее влияла на оценку недели к вечеру' : '',
        '',
      ],
      stateContext: index % 3 === 0 ? 'Неделя была неровной из-за позднего завершения работы.' : 'Состояние в целом было устойчивым.',
      support: index % 2 === 0 ? 'Один небольшой раздел на день' : 'Заранее определённый первый шаг',
      obstacle: index % 3 === 0 ? 'Позднее завершение работы' : 'Слишком широкий список задач',
      nextLever: index % 2 === 0 ? 'Отправлять готовый фрагмент до обеда' : 'Закрывать подготовку коротким итогом',
      ifThenPlan:
        index % 2 === 0
          ? 'Если начинаю снова перепроверять готовый фрагмент, отправляю его организатору на комментарий'
          : 'Если после 22:30 остаётся задача, переношу её в план следующего дня',
    };
  });

  const monthlyReviews = [-3, -2, -1].map((offset, index) => {
    const monthStart = startOfMonth(addMonths(anchor, offset));
    return {
      monthStart,
      updatedAt: isoAt(endOfMonth(monthStart), 18),
      mainPattern:
        index % 2 === 0
          ? 'Небольшие заранее выбранные шаги выполнялись устойчивее больших списков.'
          : 'После поздней работы сон и энергия чаще были ниже обычного.',
      support: index % 2 === 0 ? 'Утренний блок без сообщений и один понятный раздел доклада.' : 'Свободный вечер и прогулки.',
      obstacle: index % 2 === 0 ? 'Попытка одновременно улучшать слишком много направлений.' : 'Подготовка длилась дольше плана.',
      courseChange: index % 2 === 0 ? 'Оставить один основной раздел доклада на неделю.' : 'Завершать активную работу до 22:30.',
      nextFocus: 'Регулярно получать комментарии без увеличения вечерней нагрузки.',
      ifThenPlan: 'Если неделя перегружена, сокращаю объём шага, но не добавляю новые направления.',
    };
  });

  return {
    version: DEMO_BACKUP_VERSION,
    exportedAt: isoAt(anchor, 18),
    dailyEntries,
    results,
    lifeEvents,
    weeklyReviews,
    monthlyReviews,
    settings: {
      id: 'main',
      settingsVersion: dataVersions.settings,
      firstUse: {
        status: 'completed',
        weekStart: currentWeekStart,
        lastStep: 'overview',
        overviewSeen: true,
        updatedAt: isoAt(anchor, 18),
      },
      activeDailyBlocks: ['sleep', 'context', 'career', 'movement', 'nutrition'],
      activeLifeAreas: ['family', 'reading', 'creativity', 'rest', 'friends', 'custom:life:music'],
      customActivityOptions: [{ id: 'custom:activity:swimming', label: 'Плавание', icon: '+', custom: true, archived: false }],
      hiddenActivityIds: [],
      customCareerOptions: [
        {
          id: 'custom:career:research',
          label: 'Исследование материалов',
          icon: '+',
          custom: true,
          countsAsExternal: false,
          archived: true,
        },
      ],
      customLifeAreaOptions: [{ id: 'custom:life:music', label: 'Музыка', icon: '+', custom: true, archived: false }],
      customContextFactorOptions: [
        { id: 'custom:context:renovation-noise', label: 'Ремонт у соседей', icon: '+', custom: true, archived: true },
      ],
      hiddenContextFactorIds: [],
      activeFocusTitle: 'Подготовить короткий доклад для профессиональной встречи',
      focusOutcomeCriterion: 'Готовая версия доклада и проведённая репетиция',
      focusReviewDate,
      externalEvidenceCriterion: 'Отправленный черновик, полученный комментарий или назначенная репетиция',
      nutritionGoalCriterion: 'Регулярные приёмы пищи без позднего переедания',
      experiment: {
        id: activeExperimentId,
        active: true,
        title: 'Первый час без уведомлений',
        hypothesis: 'Станет ли проще начать запланированную задачу без переключений.',
        targetMetricId: null,
        targetMetric: '',
        targetDirection: 'increase',
        minimumMeaningfulChange: null,
        startDate: activeExperimentStart,
        endDate: activeExperimentEnd,
        conclusion: '',
        decision: null,
      },
      experimentHistory: [
        {
          id: completedExperimentId,
          title: 'Короткая прогулка после обеда',
          hypothesis: 'Поможет ли прогулка легче переключаться между задачами.',
          targetMetricId: null,
          targetMetric: '',
          targetDirection: 'increase',
          minimumMeaningfulChange: null,
          startDate: completedExperimentStart,
          endDate: completedExperimentEnd,
          conclusion: 'После прогулки переключаться было проще, но отметок пока мало для уверенного решения.',
          decision: 'more_data',
          completedAt: isoAt(completedExperimentEnd, 20),
        },
      ],
    },
  };
}

export async function writeDemoFile({ anchor = todayKey(), output = DEMO_OUTPUT_RELATIVE_PATH } = {}) {
  const outputPath = path.isAbsolute(output) ? output : path.join(projectRoot, output);
  const payload = buildDemoPayload(anchor);
  await mkdir(path.dirname(outputPath), { recursive: true });
  let serialized = JSON.stringify(payload, null, 2);
  for (const property of ['activeDailyBlocksSnapshot', 'recordedFields']) {
    serialized = compactStringArrayProperty(serialized, property);
  }
  await writeFile(outputPath, `${serialized}\n`, 'utf8');
  return { outputPath, payload };
}

function parseDate(date) {
  assertDateKey(date, 'date');
  return new Date(`${date}T00:00:00.000Z`);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function assertDateKey(date, field) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || formatDateUnchecked(date) !== date) {
    throw new Error(`${field} должен быть календарной датой в формате YYYY-MM-DD`);
  }
}

function formatDateUnchecked(date) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function isoAt(date, hour = 20) {
  return `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`;
}

function eachDate(from, through) {
  const dates = [];
  for (let cursor = from; cursor <= through; cursor = addDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

function startOfWeek(date) {
  const day = parseDate(date).getUTCDay();
  return addDays(date, -(day === 0 ? 6 : day - 1));
}

function firstMondayOnOrAfter(date) {
  const weekStart = startOfWeek(date);
  return weekStart < date ? addDays(weekStart, 7) : weekStart;
}

function endOfMonth(date) {
  return addDays(addMonths(startOfMonth(date), 1), -1);
}

function compactStringArrayProperty(json, property) {
  const pattern = new RegExp(`("${property}": \\[)\\n((?:\\s+"[^"]+",?\\n)+)(\\s*\\])`, 'g');
  return json.replace(pattern, (_, start, body) => {
    const values = body
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .join(' ');
    return `${start}${values}]`;
  });
}

function readCliOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith('--anchor=')) {
      options.anchor = argument.slice('--anchor='.length);
    } else if (argument === '--anchor') {
      options.anchor = argv[++index];
    } else if (argument.startsWith('--output=')) {
      options.output = argument.slice('--output='.length);
    } else if (argument === '--output') {
      options.output = argv[++index];
    } else {
      throw new Error(`Неизвестный аргумент: ${argument}`);
    }
  }
  return options;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const { outputPath, payload } = await writeDemoFile(readCliOptions(process.argv.slice(2)));
  console.log(
    `Generated ${path.relative(projectRoot, outputPath)} through ${payload.exportedAt.slice(0, 10)}: ${payload.dailyEntries.length} days, ${payload.results.length} results, ${payload.lifeEvents.length} events.`,
  );
}
