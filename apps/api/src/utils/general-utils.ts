// utils.ts

/**
 * Formats a Date object into a string in the format YYYY-MM-DD.
 * 
 * @param date - The Date object to format.
 * @returns A string representing the formatted date.
 */
export const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = (`0${date.getMonth() + 1}`).slice(-2);
  const day = (`0${date.getDate()}`).slice(-2);
  return `${year}-${month}-${day}`;
};

/**
 * Retrieves the last day of the previous month.
 * 
 * @returns A Date object representing the last day of the previous month.
 */
export const getLastDayOfPreviousMonth = (): Date => {
  const now = new Date();
  // Setting the date to 0 returns the last day of the previous month
  return new Date(now.getFullYear(), now.getMonth(), 0);
};

/**
 * Retrieves the first day twelve months ago from the last day of the previous month.
 * 
 * @returns A Date object representing the first day twelve months ago.
 */
export const getFirstDayTwelveMonthsAgo = (): Date => {
  const end = getLastDayOfPreviousMonth();
  return new Date(end.getFullYear(), end.getMonth() - 12, 1);
};

/**
 * Formats a numerical amount into a dollar abbreviation (e.g., K for thousand, M for million).
 * 
 * @param amount - The numerical amount to format.
 * @returns A string representing the formatted dollar amount.
 */
export const formatToDollarAbbreviation = (amount: number): string => {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  } else if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(1)}K`;
  } else {
    return `$${amount.toFixed(2)}`;
  }
};

/**
 * Checks if a given value is a positive integer.
 * 
 * @param value - The value to check, which can be a string, number, or undefined.
 * @returns A boolean indicating whether the value is a positive integer.
 */
export const isPositiveInteger = (value: string | number | undefined): boolean => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0;
};

/**
 * Retrieves the first day thirteen months ago from the last day of the previous month.
 * 
 * @returns A Date object representing the first day thirteen months ago.
 */
export const getFirstDayThirteenMonthsAgo = (): Date => {
  const end = getLastDayOfPreviousMonth();
  return new Date(end.getFullYear(), end.getMonth() - 13, 1);
};
