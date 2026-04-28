export const REQUIRED_FIELD_MESSAGE = "This field is required.";

/**
 * Extra classes for invalid inputs/selects/textareas (overrides default border from Modal / components).
 */
export function invalidFieldClassName(invalid) {
  return invalid
    ? "!border-red-600 shadow-[0_0_0_2px_rgba(220,38,38,0.22)]"
    : undefined;
}
