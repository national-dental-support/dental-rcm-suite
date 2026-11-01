import { TestBed } from '@angular/core/testing';
import { CsvExportService } from './csv-export.service';

describe('CsvExportService', () => {
  let service: CsvExportService;
  let createObjectURLSpy: jasmine.Spy;
  let revokeObjectURLSpy: jasmine.Spy;
  let createElementSpy: jasmine.Spy;
  let clickSpy: jasmine.Spy;
  let fakeAnchor: HTMLAnchorElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CsvExportService);

    fakeAnchor = document.createElement('a');
    clickSpy = spyOn(fakeAnchor, 'click');

    createElementSpy = spyOn(document, 'createElement').and.returnValue(fakeAnchor as any);
    createObjectURLSpy = spyOn(URL, 'createObjectURL').and.returnValue('blob:fake-url');
    revokeObjectURLSpy = spyOn(URL, 'revokeObjectURL');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should create an anchor element and trigger a click', () => {
    service.download('test.csv', ['Name', 'Age'], [['Alice', 30], ['Bob', 25]]);
    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('should set the correct filename on the anchor', () => {
    service.download('my-export.csv', ['Col'], [['val']]);
    expect(fakeAnchor.download).toBe('my-export.csv');
  });

  it('should set the blob URL as href', () => {
    service.download('out.csv', ['H'], [['v']]);
    expect(fakeAnchor.href).toContain('blob:fake-url');
  });

  it('should create a Blob and pass it to createObjectURL', () => {
    service.download('data.csv', ['X'], [['1']]);
    expect(createObjectURLSpy).toHaveBeenCalledWith(jasmine.any(Blob));
  });

  it('should revoke the object URL after clicking', () => {
    service.download('data.csv', ['X'], [['1']]);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:fake-url');
  });

  it('should escape values containing commas with double quotes', () => {
    service.download('data.csv', ['Col'], [['value,with,commas']]);
    const blob: Blob = createObjectURLSpy.calls.mostRecent().args[0];
    return blob.text().then(text => {
      expect(text).toContain('"value,with,commas"');
    });
  });

  it('should escape values containing double quotes', () => {
    service.download('data.csv', ['Col'], [[`say "hello"`]]);
    const blob: Blob = createObjectURLSpy.calls.mostRecent().args[0];
    return blob.text().then(text => {
      expect(text).toContain('"say ""hello"""');
    });
  });

  it('should treat null and undefined as empty strings', () => {
    service.download('data.csv', ['A', 'B'], [[null, undefined]]);
    const blob: Blob = createObjectURLSpy.calls.mostRecent().args[0];
    return blob.text().then(text => {
      const lines = text.split('\r\n');
      expect(lines[1]).toBe(',');
    });
  });

  it('should join headers and rows with commas', () => {
    service.download('data.csv', ['First', 'Last'], [['John', 'Doe']]);
    const blob: Blob = createObjectURLSpy.calls.mostRecent().args[0];
    return blob.text().then(text => {
      const lines = text.split('\r\n');
      expect(lines[0]).toBe('First,Last');
      expect(lines[1]).toBe('John,Doe');
    });
  });

  it('should use CRLF line endings', () => {
    service.download('data.csv', ['A'], [['1'], ['2']]);
    const blob: Blob = createObjectURLSpy.calls.mostRecent().args[0];
    return blob.text().then(text => {
      expect(text).toContain('\r\n');
    });
  });
});
