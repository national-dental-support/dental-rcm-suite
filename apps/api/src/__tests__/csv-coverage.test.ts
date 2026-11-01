/**
 * csv-coverage.test.ts
 * Covers: controllers/csv/index.ts (CSVDownloaderController)
 */

const mockQuery = jest.fn();

jest.mock('../modules/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getPool: () => ({
        request: () => ({
          input: jest.fn().mockReturnThis(),
          query: mockQuery,
        }),
      }),
    }),
  },
}));

jest.mock('../shared/databases', () => ({ databases: ['dental_rcm'] }));

jest.mock('mssql', () => {
  const f = (n?: any) => ({ type: 'mock', n });
  return {
    NVarChar: Object.assign(f, { MAX: f() }),
    Int: f(), BigInt: f(), Decimal: f, Bit: f(), DateTime: f(),
    Date: f(), Float: f(), VarChar: f, UniqueIdentifier: f(),
    Request: jest.fn().mockImplementation(() => ({
      input: jest.fn().mockReturnThis(),
      query: mockQuery,
    })),
  };
});

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock fast-csv
const mockCsvWrite = jest.fn();
const mockCsvEnd = jest.fn();
const mockCsvPipe = jest.fn();
const mockCsvFormat = jest.fn().mockReturnValue({
  write: mockCsvWrite,
  end: mockCsvEnd,
  pipe: mockCsvPipe,
});
jest.mock('fast-csv', () => ({ format: mockCsvFormat }));

// Mock chalk
jest.mock('chalk', () => {
  const fn = (s: any) => s;
  fn.bgRed = { white: (s: any) => s };
  return { __esModule: true, default: fn, bgRed: fn.bgRed };
});

const mockReq = (body: any = {}) => ({ body } as any);

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn();
  return r;
};

describe('CSVDownloaderController', () => {
  let CSVDownloaderController: any;

  beforeAll(() => {
    ({ CSVDownloaderController } = require('../controllers/csv/index'));
  });

  beforeEach(() => {
    mockQuery.mockReset();
    mockCsvWrite.mockClear();
    mockCsvEnd.mockClear();
    mockCsvPipe.mockClear();
  });

  it('streams CSV when query succeeds with records', async () => {
    mockQuery.mockResolvedValue({
      recordset: [
        { submitted: 100, dos_aging: '2025-01-01', days_ago: 30, code: '99213', provider: 'Dr. Smith' },
        { submitted: 200, dos_aging: '2025-01-02', days_ago: 29, code: '99214', provider: 'Dr. Jones' },
      ],
    });

    const ctrl = new CSVDownloaderController();
    const res = mockRes();
    await ctrl.export(mockReq({ filters: {} }), res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename=procedures.csv');
    expect(mockCsvPipe).toHaveBeenCalledWith(res);
    expect(mockCsvWrite).toHaveBeenCalledTimes(2);
  });

  it('streams CSV when query returns empty recordset', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });

    const ctrl = new CSVDownloaderController();
    const res = mockRes();
    await ctrl.export(mockReq({ filters: {} }), res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(mockCsvWrite).not.toHaveBeenCalled();
  });

  it('applies filters when provider, location, payer, cpt_group are set', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });

    const ctrl = new CSVDownloaderController();
    const res = mockRes();
    await ctrl.export(mockReq({
      filters: {
        provider: 'Dr. Smith',
        location: 'Clinic A',
        payer: 'Aetna',
        cpt_group: 'Surgery',
      },
    }), res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
  });

  it('treats "all" filter values as empty strings', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });

    const ctrl = new CSVDownloaderController();
    const res = mockRes();
    await ctrl.export(mockReq({
      filters: {
        provider: 'all',
        location: 'all',
        payer: 'all',
        cpt_group: 'all',
      },
    }), res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
  });

  it('returns 500 on Error instance', async () => {
    mockQuery.mockRejectedValue(new Error('DB connection failed'));

    const ctrl = new CSVDownloaderController();
    const res = mockRes();
    await ctrl.export(mockReq({ filters: {} }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('error') }));
  });

  it('returns 500 on non-Error object', async () => {
    mockQuery.mockRejectedValue('string error');

    const ctrl = new CSVDownloaderController();
    const res = mockRes();
    await ctrl.export(mockReq({ filters: {} }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('handles missing filters gracefully', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });

    const ctrl = new CSVDownloaderController();
    const res = mockRes();
    await ctrl.export(mockReq({}), res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
  });
});
