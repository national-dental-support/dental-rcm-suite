import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith, Subscription } from 'rxjs';


type Tab = { label: string; link: string };

@Component({
    selector: 'app-recon-iq',
    templateUrl: './recon-iq.component.html',
    styleUrls: ['./recon-iq.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ReconIQComponent implements OnInit, OnDestroy {
  private sub = new Subscription();


  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(){
    this.sub.add(
          this.router.events
            .pipe(
              filter((e) => e instanceof NavigationEnd),
              startWith(null),
              map(() => this.getActiveChildPath(this.route))
            )
            .subscribe((childPath) => {
              this.cdr.markForCheck();
            })
        );
  }
  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

 private getActiveChildPath(route: ActivatedRoute): string | null {
      let r: ActivatedRoute | null = route;
      while (r?.firstChild) r = r.firstChild;
      return r?.snapshot.routeConfig?.path ?? null;
    }
}

