import { Component, ContentChild, Input, OnInit, TemplateRef } from '@angular/core';

@Component({
    selector: 'app-section-card',
    templateUrl: './section-card.component.html',
    styleUrls: ['./section-card.component.scss'],
    standalone: false
})
export class SectionCardComponent implements OnInit{
  @Input() title?: string;
  @Input() tooltip: string = '';
  public hasTitle:boolean = false;
  // Detect if the consumer provided header actions content
  @ContentChild('cardHeaderActionsTpl', { read: TemplateRef }) headerTpl?: TemplateRef<any>;

  get hasHeaderActions(): boolean {
    // If they used the attribute slot, this getter won't detect it,
    // so we'll keep the container always present via CSS layout;
    // OR just return true and rely on :empty in CSS.
    return true;
  }

  constructor(){}
  
  ngOnInit(){
    if(this.title && this.title.length > 0){
      this.hasTitle = true;
    }

  }
}
