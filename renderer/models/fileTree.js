// Pure helpers over the workspace tree: [{ type: 'dir' | 'file', path, size?, children? }]

export const baseName = (path) => path.split('/').pop();

export const countFiles = (nodes) =>
  nodes.reduce((n, node) => n + (node.type === 'file' ? 1 : countFiles(node.children ?? [])), 0);

export const countDirs = (nodes) =>
  nodes.reduce((n, node) => n + (node.type === 'dir' ? 1 + countDirs(node.children ?? []) : 0), 0);

export const allFiles = (nodes) =>
  nodes.flatMap((node) => (node.type === 'file' ? [node] : allFiles(node.children ?? [])));

// The root is represented as a folder with an empty path
export const rootNode = (tree) => ({ type: 'dir', path: '', children: tree });

export function findNode(tree, path) {
  if (path === '') return rootNode(tree);
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.type === 'dir') {
        const found = walk(node.children ?? []);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(tree);
}

// One entry per folder (the folder itself plus every subfolder, depth first),
// each with only its direct files. `label` is the path relative to `node`.
export function collectFloors(node, rootName) {
  const prefix = node.path ? `${node.path}/` : '';
  const floors = [];
  const walk = (current) => {
    const children = current.children ?? [];
    const label = current === node
      ? `${node.path ? baseName(node.path) : rootName}/`
      : `${current.path.slice(prefix.length)}/`;
    floors.push({ path: current.path, label, files: children.filter((c) => c.type === 'file') });
    children.filter((c) => c.type === 'dir').forEach(walk);
  };
  walk(node);
  return floors;
}
