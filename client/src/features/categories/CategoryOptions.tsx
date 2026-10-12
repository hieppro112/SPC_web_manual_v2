// CategoryOptions — các thẻ <option> của ô chọn thể loại, thụt lề theo cây:
//   IT
//      └ AI
//   PC
// `exclude`: bỏ các thể loại này khỏi danh sách (vd khi chọn "thể loại
// cha" thì không được chọn chính nó hay con cháu của nó).
import type { CategoryNode } from './tree.ts';
import { flattenTree, indentedLabel } from './tree.ts';

export default function CategoryOptions({ tree, exclude }: { tree: CategoryNode[]; exclude?: Set<string> }) {
  return (
    <>
      {flattenTree(tree)
        .filter((node) => !exclude?.has(node.category.id))
        .map((node) => (
          <option key={node.category.id} value={node.category.id}>
            {indentedLabel(node)}
          </option>
        ))}
    </>
  );
}
