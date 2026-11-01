import chalk from 'chalk';

/**
 * 
 */

export class SortingUtils {
    /**
     * Builds SQL filter conditions based on provided filters.
     * @param filters - An object containing filter criteria.
     * @returns A string representing SQL filter conditions.
     *
     * Disclaimer: This only works for Procedures....for now.
     */

    /** TECH DEBT, COLUMN MAPS SHOULD BE DYNAMIC AND PASSED IN AS ARG */
    /** ONLY USE FOR THE AR COLLECTIONS BREAKDOWN TABLE, IF YOU NEED TO USE IT 
     * ELSEWHERE JUST CREATE A SEPARATE COLUMN CONFIGURATION OR THIS WONT WORK
     */
    public static columnMap: { [key: string]: string } = {
        name: 'p.location', // Matches `p.location` in the query
        collectionCount: 'collectionCount', // For `COUNT(*) AS collectionCount`
        patientCollections: 'patientCollections', // For `SUM(...) AS patientCollections`
        insuranceCollections: 'insuranceCollections', // For `SUM(...) AS insuranceCollections`
        grossCollections: 'grossCollections', // For `SUM(...) AS grossCollections`
        productionAdjustment: 'productionAdjustment', // For `SUM(...) AS productionAdjustment`
        collectionAdjustment: 'collectionAdjustment', // For `SUM(...) AS collectionAdjustment`
        arBalance: 'arBalance', // For `SUM(...) AS arBalance`
    };
  
    public static buildOrderByClause(
      sort: { column: string; direction: 'ASC' | 'DESC' },
      validColumns: string[]
    ): string {
      console.log(chalk.blueBright('ARController; Building ORDER BY clause...'));
    
      if (!sort || !sort.column || !sort.direction) {
        console.warn(
          chalk.yellow(
            'No sorting applied. Falling back to default ORDER BY p.location ASC.'
          )
        );
        return 'ORDER BY p.location ASC'; // Default sorting
      }
    
      const dbColumn = this.columnMap[sort.column];
      if (!dbColumn || !validColumns.includes(sort.column)) {
        console.error(chalk.redBright(`Invalid sort column: ${sort.column}`));
        return 'ORDER BY p.location ASC'; // Fallback to default sorting
      }
    
      const direction = sort.direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      return `ORDER BY ${dbColumn} ${direction}`;
    }
    
  }
  