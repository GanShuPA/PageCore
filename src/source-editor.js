import { basicSetup, EditorView } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { search } from '@codemirror/search';

export function createSourceExtensions({ isSyncing, getMode, onTextChange, onSelectionChange }) {
  return [
    basicSetup,
    markdown(),
    EditorView.lineWrapping,
    search({ top: true }),
    EditorState.phrases.of({
      Find: '查找',
      Replace: '替换',
      next: '下一个',
      previous: '上一个',
      all: '全选匹配',
      'match case': '区分大小写',
      regexp: '正则表达式',
      'by word': '全词匹配',
      replace: '替换',
      'replace all': '全部替换',
      close: '关闭',
      'No matches': '无匹配结果',
      'Go to line': '跳转到行',
    }),
    EditorView.contentAttributes.of({ 'aria-label': 'Markdown 源码编辑区', spellcheck: 'false' }),
    EditorView.updateListener.of((v) => {
      if (isSyncing()) {
        return;
      }
      if (v.docChanged && (getMode() === 'source' || getMode() === 'split')) {
        onTextChange(v.state.doc.toString());
      }
      if (v.selectionSet) {
        onSelectionChange();
      }
    }),
  ];
}
