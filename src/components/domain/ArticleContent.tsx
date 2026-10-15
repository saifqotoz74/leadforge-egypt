import React from 'react';

interface ArticleContentProps {
  content: string;
}

export function ArticleContent({ content }: ArticleContentProps) {
  const lines = content.trim().split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!currentList) return;
    if (currentList.type === 'ul') {
      elements.push(
        <ul key={key} className="space-y-2 mb-6 ps-6 text-body text-fg-secondary list-disc">
          {currentList.items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderFormattedText(item)}
            </li>
          ))}
        </ul>
      );
    } else {
      elements.push(
        <ol key={key} className="space-y-2 mb-6 ps-6 text-body text-fg-secondary list-decimal">
          {currentList.items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderFormattedText(item)}
            </li>
          ))}
        </ol>
      );
    }
    currentList = null;
  };

  const renderFormattedText = (text: string): React.ReactNode => {
    // Parse bold text **something**
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-fg-primary">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentList) {
        flushList(`list-${index}`);
      }
      return;
    }

    if (trimmed === '---') {
      if (currentList) flushList(`list-${index}`);
      elements.push(<hr key={`hr-${index}`} className="border-t border-line my-8" />);
      return;
    }

    if (trimmed.startsWith('### ')) {
      if (currentList) flushList(`list-${index}`);
      elements.push(
        <h3 key={`h3-${index}`} className="text-h3 font-semibold text-fg-primary mt-6 mb-3">
          {renderFormattedText(trimmed.replace('### ', ''))}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith('## ')) {
      if (currentList) flushList(`list-${index}`);
      elements.push(
        <h2 key={`h2-${index}`} className="text-h2 font-semibold text-fg-primary mt-8 mb-4">
          {renderFormattedText(trimmed.replace('## ', ''))}
        </h2>
      );
      return;
    }

    if (trimmed.startsWith('- ')) {
      if (!currentList || currentList.type !== 'ul') {
        if (currentList) flushList(`list-${index}`);
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(trimmed.replace('- ', ''));
      return;
    }

    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      if (!currentList || currentList.type !== 'ol') {
        if (currentList) flushList(`list-${index}`);
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(numMatch[2]);
      return;
    }

    if (currentList) {
      flushList(`list-${index}`);
    }

    elements.push(
      <p key={`p-${index}`} className="text-body text-fg-secondary leading-relaxed mb-4">
        {renderFormattedText(trimmed)}
      </p>
    );
  });

  if (currentList) {
    flushList('list-end');
  }

  return <div className="article-content">{elements}</div>;
}
