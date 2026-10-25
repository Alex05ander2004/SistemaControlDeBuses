/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  // Cada archivo e2e levanta su propia base embebida y su app: pocos workers evitan agotar los tiempos.
  maxWorkers: 3,
  testTimeout: 120000,
};
