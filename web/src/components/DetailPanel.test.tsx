import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React, { useState } from 'react';
import { DetailPanel } from './DetailPanel';
import { GraphProvider, useGraph } from '../providers/GraphProvider';

/**
 * Test for DetailPanel rendering with selection changes.
 *
 * Verifies that switching from no selection to a selection
 * doesn't crash (regression test for previous hooks-ordering bug).
 */

// Mock foundationStore to avoid IndexedDB in tests
vi.mock('../api/foundationStore', () => ({
  foundationStore: {
    getGraph: vi.fn().mockResolvedValue(null),
    putGraph: vi.fn().mockResolvedValue(undefined),
    getEntity: vi.fn().mockResolvedValue(null),
    putEntity: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock the API to avoid network calls
vi.mock('../api/icd11', () => ({
  getFoundationEntity: vi.fn().mockResolvedValue({
    '@context': 'http://id.who.int/icd/contexts/contextForFoundationEntity.json',
    '@id': 'http://id.who.int/icd/entity/123',
    title: { '@language': 'en', '@value': 'Test Entity' },
    definition: { '@language': 'en', '@value': 'A test definition' },
    parent: [],
    child: [],
  }),
  extractIdFromUri: (uri: string) => uri.split('/').pop() ?? uri,
  getTextValue: (text: { '@value': string } | undefined) => text?.['@value'] ?? '',
}));

// Mock the fetch for foundation_graph.json
const mockGraphData = {
  root: { title: 'Root', parents: [], children: ['test-123'], descendantCount: 1, maxDepth: 1 },
  'test-123': { title: 'Test Node', parents: ['root'], children: [], descendantCount: 0, maxDepth: 0 },
};

// Override global fetch for the graph JSON
const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('foundation_graph.json')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockGraphData),
      });
    }
    return originalFetch(url);
  });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('DetailPanel selection change', () => {
  it('does not crash when selection changes from null to a node', async () => {
    const errors: Error[] = [];
    const originalError = console.error;
    console.error = (...args: Parameters<typeof console.error>) => {
      const msg = typeof args[0] === 'string' ? args[0] : args[0]?.message;
      if (msg?.includes?.('Rendered more hooks')) {
        errors.push(new Error(msg));
      }
      originalError(...args);
    };

    function TestHarness() {
      const [shouldSelect, setShouldSelect] = useState(false);

      return (
        <GraphProvider>
          <GraphSetup shouldSelect={shouldSelect} />
          <DetailPanel />
          <button onClick={() => setShouldSelect(true)} data-testid="select-btn">
            Select Node
          </button>
        </GraphProvider>
      );
    }

    function GraphSetup({ shouldSelect }: { shouldSelect: boolean }) {
      const { selectNode } = useGraph();

      React.useEffect(() => {
        if (shouldSelect) {
          selectNode('test-123');
        }
      }, [shouldSelect, selectNode]);

      return null;
    }

    render(<TestHarness />);

    // Wait for graph to load
    await act(async () => {
      await new Promise(r => setTimeout(r, 200));
    });

    expect(screen.getByText('Select a concept to view details')).toBeTruthy();

    // Select a node
    await act(async () => {
      screen.getByTestId('select-btn').click();
      await new Promise(r => setTimeout(r, 200));
    });

    console.error = originalError;

    expect(errors).toHaveLength(0);
    expect(screen.getByText('Test Node')).toBeTruthy();
  });
});
