// frontend-react/src/utils/throttle.ts

export function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T {
    let last = 0;
    return ((...args: any[]) => {
        const now = Date.now();
        if (now - last < ms) return;
        last = now;
        fn(...args);
    }) as T;
}

