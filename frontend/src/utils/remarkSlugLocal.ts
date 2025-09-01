// Minimal local slug plugin to replace external remark-slug to avoid bundling issues.
// Adds id to heading nodes (h1-h6) based on text content.
import { visit } from 'unist-util-visit';

export default function remarkSlugLocal() {
  return (tree: any) => {
    visit(tree, 'heading', (node: any) => {
      const text = node.children
        .filter((c: any) => c.type === 'text' || c.type === 'inlineCode')
        .map((c: any) => c.value)
        .join(' ')
        .trim();
      if (!text) return;
      const id = text
        .toLowerCase()
        .replace(/[`*_~]+/g,'')
        .replace(/[^a-z0-9]+/g,'-')
        .replace(/^-|-$/g,'');
      if (!node.data) node.data = {};
      if (!node.data.hProperties) node.data.hProperties = {};
      if (!node.data.id) node.data.id = id;
      node.data.hProperties.id = id;
    });
  };
}