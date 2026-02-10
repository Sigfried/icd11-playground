import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React, { useState } from 'react';
import { DetailPanel } from './DetailPanel';
import {GraphProvider, useGraph} from '../providers/GraphProvider';

/**
 * Test for hooks ordering bug in DetailPanel.
 *
 * The bug: useCallback hooks were placed AFTER an early return,
 * causing "Rendered more hooks than during the previous render" error
 * when transitioning from no selection to having a selection.
 */

// Mock the API to avoid network calls
vi.mock('../api/icd11', () => ({
  getFoundationEntity: vi.fn().mockResolvedValue({
    '@id': 'http://id.who.int/icd/entity/123',
    title: { '@language': 'en', '@value': 'Test Entity' },
    definition: { '@language': 'en', '@value': 'A test definition' },
    parent: [],
    child: [],
  }),
  getFoundationRoot: vi.fn().mockResolvedValue({
    '@id': 'http://id.who.int/icd/entity/root',
    title: { '@language': 'en', '@value': 'Root' },
    child: [],
  }),
  extractIdFromUri: (uri: string) => uri.split('/').pop() ?? uri,
  getTextValue: (text: { '@value': string } | undefined) => text?.['@value'] ?? '',
}));

describe('DetailPanel hooks ordering', () => {
  it('does not crash when selection changes from null to a node', async () => {
    // This test verifies the hooks ordering bug is fixed.
    // The bug caused React to throw: "Rendered more hooks than during the previous render"
    // when selecting a node after having no selection.

    // Track if an error was thrown
    const errors: Error[] = [];
    const originalError = console.error;
    console.error = (...args) => {
      if (args[0]?.includes?.('Rendered more hooks') ||
          args[0]?.message?.includes?.('Rendered more hooks')) {
        errors.push(new Error(args[0]));
      }
      originalError(...args);
    };

    // Component that allows us to control selection and set up the graph
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

    // Helper component to set up the graph and trigger selection
    function GraphSetup({ shouldSelect }: { shouldSelect: boolean }) {
      const { selectNode, graph } = useGraph();

      // Add a test node to the graph on first render
      React.useEffect(() => {
        if (!graph.hasNode('test-123')) {
          graph.addNode('test-123', {
            id: 'test-123',
            title: 'Test Node',
            definition: 'Test definition',
            parentCount: 0,
            childCount: 0,
            childOrder: [],
          });
        }
      }, [graph]);

      // Select the node when requested
      React.useEffect(() => {
        if (shouldSelect) {
          selectNode('test-123');
        }
      }, [shouldSelect, selectNode]);

      return null;
    }

    // Initial render with no selection - should show placeholder
    render(<TestHarness />);

    // Wait for initial render
    await act(async () => {
      await new Promise(r => setTimeout(r, 100));
    });

    expect(screen.getByText('Select a concept to view details')).toBeTruthy();

    // Now click button to select a node - this triggers the hooks ordering bug
    await act(async () => {
      screen.getByTestId('select-btn').click();
      await new Promise(r => setTimeout(r, 100));
    });

    // Restore console.error
    console.error = originalError;

    // The bug would have caused a "Rendered more hooks" error
    expect(errors).toHaveLength(0);

    // If we get here without throwing, the bug is fixed
    // The detail panel should now show the node info
    expect(screen.getByText('Test Node')).toBeTruthy();
  });
});
