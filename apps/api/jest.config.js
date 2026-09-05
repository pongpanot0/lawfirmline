/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { useESM: true }],
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  transformIgnorePatterns: ['/node_modules/(?!(@nestjs|@angular)/)'],
};
