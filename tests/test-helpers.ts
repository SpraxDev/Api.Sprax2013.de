import { type DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { DeepPartial } from 'ts-essentials';

export function createStrictDeepMock<T>(mockImplementation?: DeepPartial<T>): DeepMockProxy<T> {
  return mockDeep<T>(
    {
      fallbackMockImplementation: () => {
        throw new Error('Not implemented');
      }
    },
    mockImplementation
  );
}
