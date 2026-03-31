import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAnalysisStore } from './index'

// Mock indexedDB for idb-keyval so JSDOM doesn't throw errors
vi.mock('idb-keyval', () => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
}))

describe('useAnalysisStore State Manager', () => {
    beforeEach(() => {
        // Reset state before each test
        useAnalysisStore.setState({
            isAnalyzing: false,
            currentDocumentId: null,
            risks: [],
            isHashMatch: false
        })
    })

    it('initializes with default state values', () => {
        const { result } = renderHook(() => useAnalysisStore())
        expect(result.current.isAnalyzing).toBe(false)
        expect(result.current.currentDocumentId).toBeNull()
        expect(result.current.risks).toEqual([])
        expect(result.current.isHashMatch).toBe(false)
    })

    it('handles startAnalysis correctly', () => {
        const { result } = renderHook(() => useAnalysisStore())

        act(() => {
            // Setup pre-existing risks to test clearing
            result.current.setRisks([{ clause_ref: 'Old', level: 'note', description: 'Old risk', citation: '' }])
            result.current.startAnalysis()
        })

        // startAnalysis sets isAnalyzing to true and clears prior risks
        expect(result.current.isAnalyzing).toBe(true)
        expect(result.current.risks).toEqual([])
    })

    it('adds single risks progressively', () => {
        const { result } = renderHook(() => useAnalysisStore())

        act(() => {
            result.current.addRisk({
                clause_ref: 'Điều 1',
                level: 'critical',
                description: 'Lỗ hổng nghiêm trọng',
                citation: 'Luật TM'
            })
        })

        expect(result.current.risks).toHaveLength(1)
        expect(result.current.risks[0].level).toBe('critical')
    })

    it('clearRisks resets analysis context', () => {
        const { result } = renderHook(() => useAnalysisStore())

        act(() => {
            result.current.setDocument('doc-123', true)
            result.current.addRisk({ clause_ref: 'Điều 1', level: 'note', description: 'Test', citation: 'Luật' })
            result.current.clearRisks()
        })

        expect(result.current.currentDocumentId).toBeNull()
        expect(result.current.isHashMatch).toBe(false)
        expect(result.current.isAnalyzing).toBe(false)
        expect(result.current.risks).toEqual([])
    })
})
