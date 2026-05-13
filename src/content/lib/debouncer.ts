export class Debouncer {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly ms: number) {}

  fire(fn: () => void): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      fn();
    }, this.ms);
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
