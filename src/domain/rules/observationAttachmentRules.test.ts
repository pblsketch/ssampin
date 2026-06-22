import { describe, it, expect } from 'vitest';
import {
  OBSERVATION_ATTACHMENT_LIMITS,
  extensionOf,
  attachmentKindOf,
  validateAttachmentFile,
  canAddAttachment,
  storageRefFor,
  truncateExtractedText,
} from './observationAttachmentRules';

describe('observationAttachmentRules', () => {
  describe('extensionOf', () => {
    it('소문자 확장자를 추출한다', () => {
      expect(extensionOf('사진.JPG')).toBe('jpg');
      expect(extensionOf('보고서.hwpx')).toBe('hwpx');
      expect(extensionOf('a.b.PDF')).toBe('pdf');
    });
    it('확장자가 없으면 빈 문자열', () => {
      expect(extensionOf('noext')).toBe('');
    });
  });

  describe('attachmentKindOf', () => {
    it('이미지 확장자는 image', () => {
      expect(attachmentKindOf('a.png')).toBe('image');
      expect(attachmentKindOf('a.jpeg')).toBe('image');
      expect(attachmentKindOf('a.webp')).toBe('image');
    });
    it('문서 확장자는 document', () => {
      expect(attachmentKindOf('a.pdf')).toBe('document');
      expect(attachmentKindOf('a.hwpx')).toBe('document');
      expect(attachmentKindOf('a.xlsx')).toBe('document');
      expect(attachmentKindOf('a.docx')).toBe('document');
    });
    it('미지원 확장자는 null', () => {
      expect(attachmentKindOf('a.zip')).toBeNull();
      expect(attachmentKindOf('a.exe')).toBeNull();
      expect(attachmentKindOf('noext')).toBeNull();
    });
  });

  describe('validateAttachmentFile', () => {
    it('정상 이미지는 통과(kind=image)', () => {
      expect(validateAttachmentFile('photo.png', 1024)).toEqual({ ok: true, kind: 'image' });
    });
    it('정상 문서는 통과(kind=document)', () => {
      expect(validateAttachmentFile('report.hwpx', 1024)).toEqual({ ok: true, kind: 'document' });
    });
    it('보안 차단 확장자는 거부', () => {
      const r = validateAttachmentFile('virus.exe', 10);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain('보안');
    });
    it('미지원 확장자는 거부', () => {
      const r = validateAttachmentFile('archive.zip', 10);
      expect(r.ok).toBe(false);
    });
    it('이미지 크기 초과는 거부', () => {
      const r = validateAttachmentFile(
        'big.png',
        OBSERVATION_ATTACHMENT_LIMITS.IMAGE_MAX_BYTES + 1,
      );
      expect(r.ok).toBe(false);
    });
    it('이미지 한도 경계값은 통과', () => {
      const r = validateAttachmentFile('edge.png', OBSERVATION_ATTACHMENT_LIMITS.IMAGE_MAX_BYTES);
      expect(r.ok).toBe(true);
    });
    it('문서 크기 초과는 거부', () => {
      const r = validateAttachmentFile('big.pdf', OBSERVATION_ATTACHMENT_LIMITS.DOC_MAX_BYTES + 1);
      expect(r.ok).toBe(false);
    });
    it('이미지보다 큰 문서(이미지 한도 초과·문서 한도 이하)는 통과', () => {
      const size = OBSERVATION_ATTACHMENT_LIMITS.IMAGE_MAX_BYTES + 1024;
      expect(validateAttachmentFile('mid.pdf', size).ok).toBe(true);
      expect(validateAttachmentFile('mid.png', size).ok).toBe(false);
    });
  });

  describe('canAddAttachment', () => {
    it('한도 미만이면 true', () => {
      expect(canAddAttachment(0)).toBe(true);
      expect(canAddAttachment(OBSERVATION_ATTACHMENT_LIMITS.MAX_PER_OBSERVATION - 1)).toBe(true);
    });
    it('한도 도달이면 false', () => {
      expect(canAddAttachment(OBSERVATION_ATTACHMENT_LIMITS.MAX_PER_OBSERVATION)).toBe(false);
      expect(canAddAttachment(OBSERVATION_ATTACHMENT_LIMITS.MAX_PER_OBSERVATION + 1)).toBe(false);
    });
  });

  describe('storageRefFor', () => {
    it('obs-attachments/{id}.{ext} 형태', () => {
      expect(storageRefFor('abc', 'photo.PNG')).toBe('obs-attachments/abc.png');
      expect(storageRefFor('xyz', 'report.hwpx')).toBe('obs-attachments/xyz.hwpx');
    });
    it('확장자 없으면 bin', () => {
      expect(storageRefFor('id1', 'noext')).toBe('obs-attachments/id1.bin');
    });
  });

  describe('truncateExtractedText', () => {
    it('한도 이하는 원본 유지', () => {
      expect(truncateExtractedText('가나다')).toBe('가나다');
    });
    it('한도 초과는 잘라낸다', () => {
      const long = 'x'.repeat(OBSERVATION_ATTACHMENT_LIMITS.EXTRACTED_TEXT_MAX + 100);
      expect(truncateExtractedText(long).length).toBe(
        OBSERVATION_ATTACHMENT_LIMITS.EXTRACTED_TEXT_MAX,
      );
    });
  });
});
