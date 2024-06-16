export enum TaskPriority {
  NORMAL = 0,
  HIGH = 10,
}

export default abstract class Task {
  protected constructor(
    public readonly displayName: string,
    public readonly priority: TaskPriority
  ) {
  }

  abstract run(): Promise<void>;

  abstract equals(other: Task): boolean;
}
