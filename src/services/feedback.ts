interface FeedbackErrorBody {
  error?: string;
}

export async function sendFeedback(message: string, accessToken: string): Promise<void> {
  const response = await fetch('/api/feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message }),
  });

  if (response.ok) {
    return;
  }

  const body = (await response.json().catch(() => ({}))) as FeedbackErrorBody;
  throw new Error(body.error || 'Не удалось отправить сообщение. Попробуй ещё раз.');
}
