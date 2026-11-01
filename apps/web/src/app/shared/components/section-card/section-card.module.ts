import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SectionCardComponent } from './section-card.component';

@NgModule({
  declarations: [SectionCardComponent],
  imports: [CommonModule, MatCardModule, MatIconModule, MatTooltipModule],
  exports: [SectionCardComponent],
})
export class SectionCardModule {}
