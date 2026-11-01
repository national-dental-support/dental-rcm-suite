import { Pipe, PipeTransform } from '@angular/core';
import { EMPTY_DISPLAY } from '../utils/display.utils';

@Pipe({
    name: 'emptyValue',
    standalone: false
})
export class EmptyValuePipe implements PipeTransform {
  transform(value: unknown): string {
    if (value === null || value === undefined || value === '' || value === '--') {
      return EMPTY_DISPLAY;
    }
    return String(value);
  }
}
