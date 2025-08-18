import { type DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { DeepPartial } from 'ts-essentials';

export function createStrictDeepMock<T>(mockImplementation?: DeepPartial<T>): DeepMockProxy<T> {
  return mockDeep<T>(
    {
      fallbackMockImplementation: () => {
        throw new Error('Mock not implemented');
      },
    },
    mockImplementation,
  );
}
