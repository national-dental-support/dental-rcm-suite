export const abbreviate = (value: number | string): string => {
  // Handle string values by cleaning and parsing them
  if (typeof value === 'string') {
    // Remove commas, dollar signs, and other non-numeric characters
    value = value.replace(/[^0-9.-]+/g, '');
    const parsedValue = parseFloat(value);
    if (isNaN(parsedValue)) {
      console.error(`Invalid value: ${value}`);
      return '0.00'; // Return a default value for invalid inputs
    }
    value = parsedValue;
  }

  // Perform abbreviation on numeric values
  if (value < 1000) {
    return value.toFixed(2); // Return values less than 1000 as-is, with 2 decimal places
  } else if (value >= 1000 && value < 1_000_000) {
    return (value / 1000).toFixed(1) + 'k'; // Thousands
  } else if (value >= 1_000_000 && value < 1_000_000_000) {
    return (value / 1_000_000).toFixed(1) + 'm'; // Millions
  } else {
    return (value / 1_000_000_000).toFixed(1) + 'b'; // Billions
  }
};
