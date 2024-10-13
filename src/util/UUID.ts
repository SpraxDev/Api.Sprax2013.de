export default class UUID {
  private static readonly UUID_REGEX = /^[a-f0-9]{32}$/;

  static normalize(uuid: string): string {
    return uuid.toLowerCase().replaceAll('-', '');
  }

  static looksLikeUuid(uuid: string): boolean {
    return this.UUID_REGEX.test(this.normalize(uuid));
  }
}
