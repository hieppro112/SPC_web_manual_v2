// CategoryOptions — các thẻ <option> của ô chọn thể loại, thụt lề theo cây + đường dẫn đầy đủ:
//   PE IT
//      └ PE IT › Biểu mẫu
//   QA
//      └ QA › Biểu mẫu
// `exclude`: bỏ các thể loại này khỏi danh sách (vd khi chọn "thể loại
// cha" thì không được chọn chính nó hay con cháu của nó).
import type { CategoryNode } from './tree.ts';
import { flattenWithPath, indentedLabel } from './tree.ts';

export default function CategoryOptions({ tree, exclude }: { tree: CategoryNode[]; exclude?: Set<string> }) {
  return (
    <>
      {flattenWithPath(tree)
        .filter(({ node }) => !exclude?.has(node.category.id))
        .map(({ node, path }) => (
          <option key={node.category.id} value={node.category.id}>
            {indentedLabel(node, path)}
          </option>
        ))}
    </>
  );
}
