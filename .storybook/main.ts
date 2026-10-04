import type { StorybookConfig } from '@storybook/vue3-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|ts)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
  core: {
    builder: {
      name: '@storybook/builder-vite',
      options: {
        viteConfigPath: '.storybook/vite.config.ts',
      },
    },
  },
};

export default config;
