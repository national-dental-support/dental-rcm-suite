import { Directive, ElementRef, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';


@Directive({
    selector: '[appInViewOnce]',
    standalone: false
})
export class InViewOnceDirective implements OnInit, OnDestroy {
@Output() visible = new EventEmitter<void>();
private observer?: IntersectionObserver;


constructor(private el: ElementRef) {}


ngOnInit() {
this.observer = new IntersectionObserver((entries) => {
entries.forEach((entry) => {
if (entry.isIntersecting) {
this.visible.emit();
this.disconnect();
}
});
}, { threshold: 0.1 });
this.observer.observe(this.el.nativeElement);
}


ngOnDestroy() { this.disconnect(); }
private disconnect() { this.observer?.disconnect(); this.observer = undefined; }
}