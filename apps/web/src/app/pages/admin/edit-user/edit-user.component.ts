import {ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'rp-edit-user',
    template: `<h1>Edit User</h1><p>TODO: reuse AddUserComponent form with loaded data.</p>`,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class EditUserComponent {}
