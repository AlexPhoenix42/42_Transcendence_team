// Minimal ambient types for the `rasti` MVC library (untyped upstream, no
// `.d.ts` shipped). Only the two subpaths this engine actually imports are
// declared, loosely - `rasti` classes are designed to have arbitrary option
// keys merged onto the instance (`viewOptions`/`modelOptions`), so an index
// signature is the honest shape here rather than fighting that with `any`
// scattered everywhere it's subclassed.

declare module "rasti/View.js" {
    export default class View {
        static sanitize(value: unknown): string;
        el: HTMLElement;
        model?: unknown;
        children: View[];
        uid: number;
        [key: string]: unknown;

        constructor(options?: Record<string, unknown>);
        preinitialize(...args: unknown[]): void;
        $(selector: string): Element | null;
        $$(selector: string): NodeListOf<Element>;
        render(): this;
        delegateEvents(events?: Record<string, unknown>): this;
        undelegateEvents(): this;
        addChild<T extends View>(child: T): T;
        destroyChildren(): void;
        createElement(tag?: string, attributes?: Record<string, string>): HTMLElement;
        removeElement(): this;
        destroy(...args: unknown[]): this;
        on(event: string, listener: (...args: any[]) => void): this;
        off(event?: string, listener?: (...args: any[]) => void): this;
        emit(event: string, ...args: unknown[]): this;
    }
}

declare module "rasti/Model.js" {
    export default class Model {
        [key: string]: unknown;
        defaults: Record<string, unknown> | (() => Record<string, unknown>);
        attributes: Record<string, unknown>;
        previous: Record<string, unknown>;

        constructor(...args: unknown[]);
        preinitialize(...args: unknown[]): void;
        parse(...args: unknown[]): Record<string, unknown>;
        get(attr: string): unknown;
        set(attrs: Record<string, unknown>, options?: Record<string, unknown>): this;
        toJSON(): Record<string, unknown>;
        on(event: string, listener: (...args: any[]) => void): this;
        off(event?: string, listener?: (...args: any[]) => void): this;
        emit(event: string, ...args: unknown[]): this;
    }
}
