export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timeoutId: NodeJS.Timeout | undefined;

  const debounced = (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };

  return debounced;
}

export function debouncePromise<T extends (...args: any[]) => Promise<any>>(
  func: T,
  delay: number
): (...args: Parameters<T>) => Promise<ReturnType<T> | undefined> {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>): Promise<ReturnType<T> | undefined> => {
    return new Promise((resolve) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        try {
          const result = await func(...args);
          resolve(result);
        } catch (error) {
          console.error('Debounced function error:', error);
          resolve(undefined);
        }
      }, delay);
    });
  };
}
