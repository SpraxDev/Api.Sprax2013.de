export default class ResolvedToNonUnicastIpError extends Error {
  constructor(actualRange: string) {
    super(`The given host resolves to a non-unicast IP range: ${actualRange}`);
  }
}
