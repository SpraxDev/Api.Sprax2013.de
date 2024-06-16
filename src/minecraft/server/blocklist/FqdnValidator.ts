import { singleton } from 'tsyringe';

@singleton()
export default class FqdnValidator {
  // A very simple pattern to not risk false-positives (based on RFC 1034)
  private readonly FQDN_PATTERN = /^(?:[a-z0-9-]{1,63}\.)+[a-z][a-z0-9-]{0,63}\.?$/i;

  validateFqdn(input: string): boolean {
    return input.length <= 255 && this.FQDN_PATTERN.test(input);
  }
}
