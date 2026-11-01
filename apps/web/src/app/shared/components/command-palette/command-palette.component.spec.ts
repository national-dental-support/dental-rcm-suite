import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommandPaletteComponent } from './command-palette.component';

describe('CommandPaletteComponent', () => {
  let component: CommandPaletteComponent;
  let fixture: ComponentFixture<CommandPaletteComponent>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<CommandPaletteComponent>>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    mockDialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      declarations: [CommandPaletteComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: Router, useValue: mockRouter },
        { provide: MAT_DIALOG_DATA, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CommandPaletteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should populate commands list on init', () => {
    expect(component.commands.length).toBeGreaterThan(0);
  });

  it('should initialize filtered with all commands', () => {
    expect(component.filtered.length).toBe(component.commands.length);
  });

  it('should filter commands by query', () => {
    component.query = 'home';
    component.filterCommands();
    expect(component.filtered.every(c => c.label.toLowerCase().includes('home'))).toBeTrue();
  });

  it('should show all commands when query is empty', () => {
    component.query = '';
    component.filterCommands();
    expect(component.filtered.length).toBe(component.commands.length);
  });

  it('should reset selectedIndex to 0 on filterCommands()', () => {
    component.selectedIndex = 3;
    component.query = 'admin';
    component.filterCommands();
    expect(component.selectedIndex).toBe(0);
  });

  it('should move selection forward', () => {
    component.selectedIndex = 0;
    component.moveSelection(1);
    expect(component.selectedIndex).toBe(1);
  });

  it('should not go below 0', () => {
    component.selectedIndex = 0;
    component.moveSelection(-1);
    expect(component.selectedIndex).toBe(0);
  });

  it('should not exceed filtered length', () => {
    component.selectedIndex = component.filtered.length - 1;
    component.moveSelection(999);
    expect(component.selectedIndex).toBe(component.filtered.length - 1);
  });

  it('should close dialog on close()', () => {
    component.close();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });

  it('should run selected command and close', () => {
    component.selectedIndex = 0;
    const cmd = component.filtered[0];
    spyOn(cmd, 'action');
    component.runSelected();
    expect(mockDialogRef.close).toHaveBeenCalled();
    expect(cmd.action).toHaveBeenCalled();
  });

  it('should navigate and close when run(cmd) is called', () => {
    const cmd = component.commands.find(c => c.label === 'Go to Home')!;
    spyOn(cmd, 'action');
    component.run(cmd);
    expect(mockDialogRef.close).toHaveBeenCalled();
    expect(cmd.action).toHaveBeenCalled();
  });

  it('runSelected should do nothing when filtered list is empty', () => {
    // Force filtered to be empty so the if-guard fires (arm1 = condition false)
    component.filtered = [];
    component.selectedIndex = 0;
    expect(() => component.runSelected()).not.toThrow();
    // dialogRef.close should NOT have been called
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  });
});
