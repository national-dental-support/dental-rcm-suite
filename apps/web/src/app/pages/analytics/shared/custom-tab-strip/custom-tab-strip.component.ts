import {ChangeDetectionStrategy, Component, Input, Output, EventEmitter } from '@angular/core';


@Component({
    selector: 'app-custom-tab-strip',
    templateUrl: './custom-tab-strip.component.html',
    styleUrls: ['./custom-tab-strip.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class CustomTabStripComponent {
  @Input() tabs: string[] = [];
  @Input() components: any[] = [];
  @Input() selectedIndex: number = 0;
  @Output() tabChanged = new EventEmitter<number>()
}