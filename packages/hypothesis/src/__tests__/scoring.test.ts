import { describe, it, expect } from 'vitest';
import { getConfidenceLevel } from '../scoring.js';

describe('getConfidenceLevel', () => {
  it('returns LOW for sampleSize < 15', () => {
    expect(getConfidenceLevel(0)).toBe('LOW');
    expect(getConfidenceLevel(1)).toBe('LOW');
    expect(getConfidenceLevel(14)).toBe('LOW');
  });

  it('returns MEDIUM for sampleSize 15-30', () => {
    expect(getConfidenceLevel(15)).toBe('MEDIUM');
    expect(getConfidenceLevel(20)).toBe('MEDIUM');
    expect(getConfidenceLevel(30)).toBe('MEDIUM');
  });

  it('returns HIGH for sampleSize > 30', () => {
    expect(getConfidenceLevel(31)).toBe('HIGH');
    expect(getConfidenceLevel(100)).toBe('HIGH');
    expect(getConfidenceLevel(500)).toBe('HIGH');
  });

  it('handles boundary values correctly', () => {
    expect(getConfidenceLevel(14)).toBe('LOW');
    expect(getConfidenceLevel(15)).toBe('MEDIUM');
    expect(getConfidenceLevel(30)).toBe('MEDIUM');
    expect(getConfidenceLevel(31)).toBe('HIGH');
  });
});
