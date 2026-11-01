import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { AppComponent } from '../app/app';
import { routes, routingProviders } from './app.routes';
import { TopNavComponent } from './layout/top-nav/top-nav.component';
import { SideNavComponent } from './layout/side-nav/side-nav';
import { LayoutComponent } from './layout/layout';
import { MaterialModule } from './shared/material/material.module';
import { LoginComponent } from './pages/login/login.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { SharedComponentsModule } from './shared/shared-components.module';
import { RouterModule } from '@angular/router';
import { AuthTokenInterceptor } from './core/interceptors/auth-token.interceptor';
import { ApiKeyInterceptor } from './core/interceptors/http-config.interceptor';
import { AnalyticsInterceptor } from './core/interceptors/analytics.interceptor';
import { SubscriptionErrorInterceptor } from './core/interceptors/subscription-error.interceptor';
import { NotificationBellComponent } from './shared/components/notification-bell/notification-bell.component';
import { CommandPaletteComponent } from './shared/components/command-palette/command-palette.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

@NgModule({
    declarations: [
        AppComponent,
        LoginComponent,
        TopNavComponent,
        SideNavComponent,
        LayoutComponent,
        NotificationBellComponent,
        CommandPaletteComponent,
    ],
    bootstrap: [AppComponent],
    imports: [
        BrowserModule,
        BrowserAnimationsModule,
        FormsModule,
        ReactiveFormsModule,
        MaterialModule,
        SharedComponentsModule,
        RouterModule.forRoot(routes),
    ],
    providers: [
        // Attaches the session bearer token to API requests.
        { provide: HTTP_INTERCEPTORS, useClass: AuthTokenInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: ApiKeyInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: SubscriptionErrorInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: AnalyticsInterceptor, multi: true },
        routingProviders,
        provideHttpClient(withInterceptorsFromDi()),
    ],
})
export class AppModule {}
