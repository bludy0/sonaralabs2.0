/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  passWithNoTests: true,
  globals: {
    'ts-jest': {
      tsconfig: {
        types: ['jest', 'node'],
        esModuleInterop: true,
        strict: true,
      },
    },
  },
};
