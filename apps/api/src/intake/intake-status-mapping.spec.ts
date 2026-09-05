import { mapInternalStatusToExternal } from './intake-status-mapping';

describe('mapInternalStatusToExternal', () => {
  it('maps RECEIVED to "สำนักงานรับเรื่องแล้ว"', () => {
    expect(mapInternalStatusToExternal({ status: 'RECEIVED', decision: null })).toBe(
      'สำนักงานรับเรื่องแล้ว',
    );
  });

  it('maps ASSESSING to "รอตกลงขอบเขต"', () => {
    expect(mapInternalStatusToExternal({ status: 'ASSESSING', decision: null })).toBe(
      'รอตกลงขอบเขต',
    );
  });

  it('maps ACCEPTED to "รับดำเนินการ"', () => {
    expect(mapInternalStatusToExternal({ status: 'ACCEPTED', decision: 'FILE_SUIT' })).toBe(
      'รับดำเนินการ',
    );
  });

  it('maps REJECTED to "ไม่รับดำเนินการ"', () => {
    expect(mapInternalStatusToExternal({ status: 'REJECTED', decision: 'DO_NOT_FILE' })).toBe(
      'ไม่รับดำเนินการ',
    );
  });

  it('maps CONVERTED to "รับดำเนินการ" (case opened, still in progress from the client\'s view)', () => {
    expect(mapInternalStatusToExternal({ status: 'CONVERTED', decision: 'FILE_SUIT' })).toBe(
      'รับดำเนินการ',
    );
  });
});
