import { Input, Component, ViewChild, ViewContainerRef, AfterViewInit, Type } from '@angular/core';

@Component({
    selector: 'app-basic-card',
    templateUrl: './basic-card.component.html',
    styleUrls: ['./basic-card.component.scss'],
    standalone: false
})
export class BasicCardComponent implements AfterViewInit {
  @Input() component!: Type<any>; //  Accepts dynamic Angular component class

  @ViewChild('container', { read: ViewContainerRef }) container!: ViewContainerRef;

  ngAfterViewInit(): void {
    if (this.component) {
      this.container.clear();
      this.container.createComponent(this.component);
    }
  }
}