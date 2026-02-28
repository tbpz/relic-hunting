/**
 * RunManager – Global singleton to track run state.
 */
export class RunManager {
  private static _instance: RunManager;

  public hp: number = 2;
  public durability: number = 100;
  public runBag: string[] = [];

  private constructor() {}

  public static getInstance(): RunManager {
    if (!RunManager._instance) {
      RunManager._instance = new RunManager();
    }
    return RunManager._instance;
  }

  /** Reset run state (useful when starting a new run) */
  public reset(): void {
    this.hp = 2;
    this.durability = 100;
    this.runBag = [];
  }

  public addLoot(item: string): void {
    this.runBag.push(item);
  }

  public takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
  }

  public wear(amount: number): void {
    this.durability = Math.max(0, this.durability - amount);
  }
}
