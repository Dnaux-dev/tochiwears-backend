/** The 36 states of Nigeria plus the Federal Capital Territory. */
export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
  'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau',
  'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const;

export type NigerianState = (typeof NIGERIAN_STATES)[number];

/** Common alternative spellings accepted from clients. */
const ALIASES: Record<string, NigerianState> = {
  abuja: 'FCT',
  'federal capital territory': 'FCT',
  'fct abuja': 'FCT',
  'fct - abuja': 'FCT',
  'akwa-ibom': 'Akwa Ibom',
  'cross-river': 'Cross River',
  nassarawa: 'Nasarawa',
};

/** Match a state name case-insensitively (and a few aliases); undefined if unknown. */
export function normalizeState(input: string): NigerianState | undefined {
  const key = input.trim().toLowerCase().replace(/\s+state$/, '').replace(/\s+/g, ' ');
  return ALIASES[key] ?? NIGERIAN_STATES.find((s) => s.toLowerCase() === key);
}
