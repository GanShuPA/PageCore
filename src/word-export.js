import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  ExternalHyperlink,
  HeadingLevel,
  WidthType,
  TableLayoutType,
  AlignmentType,
  LevelFormat,
  BorderStyle,
  ShadingType,
} from 'docx';
import { Math as WordMath, latexToMath } from 'docx/math';

const pageWidth = 9638; // A4 minus two 20 mm margins, in twips.
const font = { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'Microsoft YaHei' };
const border = { style: BorderStyle.SINGLE, size: 4, color: 'CED4CA' };

// Convert browser-readable raster images to portable PNGs, with bounded decoded size.
export async function loadWordImage(src) {
  if (!/^(data:image\/(png|jpeg|gif|webp);base64,|https?:\/\/)/i.test(src)) {
    throw new Error('图片路径无效，请先保存文档并检查图片路径。');
  }
  const image = new Image();
  image.crossOrigin = 'anonymous';
  const loaded = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      image.src = '';
      reject(new Error('图片加载超时'));
    }, 15000);
    image.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error('图片无法加载或不允许跨域读取'));
    };
  });
  image.src = src;
  await loaded;
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('图片尺寸无效');
  }
  const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL('image/png');
  if (data.length > 20 * 1024 * 1024) {
    throw new Error('图片过大，请缩小后导出');
  }
  return { data, width: image.naturalWidth, height: image.naturalHeight, type: 'png' };
}

export async function createWordDocument(title, sanitizedHtml, loadImage = loadWordImage) {
  const root = document.createElement('div');
  root.innerHTML = sanitizedHtml;
  const images = new Map();
  const warnings = new Set();
  for (const image of root.querySelectorAll('img')) {
    const src = image.getAttribute('src') || '';
    if (!images.has(src)) {
      try {
        images.set(src, await loadImage(src));
      } catch (error) {
        throw new Error(
          `图片“${image.alt || '未命名'}”无法导出：${error.message}。可将图片保存到文档目录后重试。`,
          { cause: error },
        );
      }
    }
  }
  const numbering = [];
  function inline(nodes, style = {}, width = pageWidth) {
    return Array.from(nodes).flatMap((node) => {
      if (node.nodeType === 3) {
        const text = node.textContent.replace(/\s+/g, ' ');
        return text ? [new TextRun({ text, ...style })] : [];
      }
      if (node.nodeType !== 1) {
        return [];
      }
      const tag = node.tagName.toLowerCase();
      if (tag === 'br') {
        return [new TextRun({ break: 1 })];
      }
      if (tag === 'input') {
        return [new TextRun({ text: node.checked ? '☑ ' : '☐ ', font: 'Segoe UI Symbol' })];
      }
      if (tag === 'img') {
        const image = images.get(node.getAttribute('src') || '');
        const scale = Math.min(1, width / 15 / image.width, 850 / image.height);
        return [
          new ImageRun({
            type: image.type,
            data: image.data,
            transformation: {
              width: Math.max(1, Math.round(image.width * scale)),
              height: Math.max(1, Math.round(image.height * scale)),
            },
            altText: {
              title: node.alt || '图片',
              description: node.alt || '文档图片',
              name: 'image',
            },
          }),
        ];
      }
      if (tag === 'math') {
        const latex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
        try {
          if (!latex) {
            throw new Error('No LaTeX');
          }
          return [new WordMath({ children: latexToMath(latex) })];
        } catch {
          warnings.add('部分公式不受支持，已保留 LaTeX 原文');
          return [new TextRun({ text: latex || node.textContent, font: 'Consolas' })];
        }
      }
      if (tag === 'annotation' || tag === 'script' || tag === 'style') {
        return [];
      }
      const next = { ...style };
      if (tag === 'strong' || tag === 'b') {
        next.bold = true;
      }
      if (tag === 'em' || tag === 'i') {
        next.italics = true;
      }
      if (['s', 'del', 'strike'].includes(tag)) {
        next.strike = true;
      }
      if (tag === 'u') {
        next.underline = {};
      }
      if (tag === 'sup') {
        next.superScript = true;
      }
      if (tag === 'sub') {
        next.subScript = true;
      }
      if (tag === 'code') {
        next.font = 'Consolas';
        next.shading = { fill: 'F1F3ED', type: ShadingType.CLEAR };
      }
      if (tag === 'a' && /^https?:\/\//i.test(node.getAttribute('href') || '')) {
        return [
          new ExternalHyperlink({
            link: node.getAttribute('href'),
            children: inline(node.childNodes, { ...next, color: '46673C', underline: {} }, width),
          }),
        ];
      }
      return inline(node.childNodes, next, width);
    });
  }

  function blocks(nodes, context = {}) {
    const output = [];
    let pending = [];
    const flush = () => {
      if (pending.some((n) => n.nodeType === 1 || n.textContent.trim())) {
        output.push(
          new Paragraph({
            ...context.paragraph,
            children: inline(pending, context.run, context.width),
          }),
        );
      }
      pending = [];
    };
    for (const node of nodes) {
      const tag = node.nodeType === 1 ? node.tagName.toLowerCase() : '';
      if (!/^(p|h[1-6]|ul|ol|blockquote|pre|table|hr|div)$/.test(tag)) {
        pending.push(node);
        continue;
      }
      flush();
      if (tag === 'ul' || tag === 'ol') {
        const level = Math.min(context.level || 0, 8);
        const reference = 'list-' + numbering.length;
        const start = Number.parseInt(node.getAttribute('start'), 10);
        numbering.push({
          reference,
          levels: Array.from({ length: 9 }, (_, index) => ({
            level: index,
            format: tag === 'ol' ? LevelFormat.DECIMAL : LevelFormat.BULLET,
            text: tag === 'ol' ? `%${index + 1}.` : '•',
            start: Number.isFinite(start) && start > 0 ? Math.min(start, 32767) : 1,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 420 * (index + 1), hanging: 260 } } },
          })),
        });
        for (const item of Array.from(node.children).filter((el) => el.tagName === 'LI')) {
          const children = Array.from(item.childNodes);
          const task = item.querySelector(
            ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]',
          );
          const listParagraph = task
            ? { indent: { left: 420 * (level + 1), hanging: 260 } }
            : { numbering: { reference, level } };
          // Only the first paragraph carries a marker; continuation paragraphs retain indentation.
          const nestedIndex = children.findIndex(
            (el) => el.nodeType === 1 && /^(UL|OL)$/.test(el.tagName),
          );
          const initial = nestedIndex < 0 ? children : children.slice(0, nestedIndex);
          const first = initial.findIndex((el) => el.nodeType === 1 && el.tagName === 'P');
          if (first >= 0) {
            output.push(
              ...blocks(initial.slice(0, first + 1), {
                ...context,
                paragraph: { ...context.paragraph, ...listParagraph },
                level: level + 1,
              }),
            );
            output.push(
              ...blocks(initial.slice(first + 1), {
                ...context,
                paragraph: { ...context.paragraph, indent: { left: 420 * (level + 1) } },
                level: level + 1,
              }),
            );
          } else {
            output.push(
              ...blocks(initial, {
                ...context,
                paragraph: { ...context.paragraph, ...listParagraph },
                level: level + 1,
              }),
            );
          }
          if (nestedIndex >= 0) {
            output.push(...blocks(children.slice(nestedIndex), { ...context, level: level + 1 }));
          }
        }
      } else if (tag === 'table') {
        const rows = Array.from(
          node.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr'),
        );
        const columns = Math.max(1, ...rows.map((row) => row.children.length));
        const width = context.width || pageWidth;
        output.push(
          new Table({
            width: { size: width, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            columnWidths: Array(columns).fill(Math.floor(width / columns)),
            rows: rows.map(
              (row) =>
                new TableRow({
                  tableHeader: row.parentElement.tagName === 'THEAD',
                  cantSplit: true,
                  children: Array.from(row.children).map((cell) => {
                    const header = cell.tagName === 'TH';
                    const children = blocks(cell.childNodes, {
                      width: width / columns - 240,
                      run: { bold: header },
                      paragraph: {
                        alignment: ['left', 'center', 'right'].includes(cell.getAttribute('align'))
                          ? cell.getAttribute('align')
                          : AlignmentType.LEFT,
                      },
                    });
                    return new TableCell({
                      children: children.length ? children : [new Paragraph('')],
                      width: { size: width / columns, type: WidthType.DXA },
                      margins: { top: 90, bottom: 90, left: 120, right: 120 },
                      borders: { top: border, bottom: border, left: border, right: border },
                      shading: header ? { fill: 'EDF0E7', type: ShadingType.CLEAR } : undefined,
                    });
                  }),
                }),
            ),
          }),
        );
        output.push(new Paragraph({ spacing: { after: 100 } }));
      } else if (tag === 'pre') {
        output.push(
          ...node.textContent
            .replace(/\n$/, '')
            .split('\n')
            .map(
              (line) =>
                new Paragraph({
                  ...context.paragraph,
                  spacing: { before: 0, after: 0, line: 280 },
                  shading: { fill: 'F1F3ED', type: ShadingType.CLEAR },
                  children: [
                    new TextRun({
                      text: line || ' ',
                      font: { ...font, ascii: 'Consolas', hAnsi: 'Consolas' },
                      size: 19,
                    }),
                  ],
                }),
            ),
        );
      } else if (tag === 'blockquote') {
        output.push(
          ...blocks(node.childNodes, {
            ...context,
            paragraph: {
              ...context.paragraph,
              indent: { left: 360 },
              border: { left: { ...border, color: 'AAB870', size: 16, space: 10 } },
            },
          }),
        );
      } else if (tag === 'hr') {
        output.push(
          new Paragraph({ border: { bottom: border }, spacing: { before: 120, after: 120 } }),
        );
      } else if (tag === 'div') {
        output.push(...blocks(node.childNodes, context));
      } else {
        output.push(
          new Paragraph({
            ...context.paragraph,
            heading: /^h[1-6]$/.test(tag) ? HeadingLevel['HEADING_' + tag[1]] : undefined,
            children: inline(node.childNodes, context.run, context.width),
          }),
        );
      }
    }
    flush();
    return output;
  }
  const children = blocks(root.childNodes);
  const doc = new Document({
    creator: 'PAGECORE',
    title,
    description: 'Markdown 文档',
    numbering: { config: numbering },
    styles: {
      default: {
        document: {
          run: { font, size: 22, color: '000000' },
          paragraph: { spacing: { after: 120, line: 330 }, widowControl: true },
        },
      },
      paragraphStyles: Array.from({ length: 6 }, (_, index) => ({
        id: `Heading${index + 1}`,
        name: `heading ${index + 1}`,
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font, bold: true, color: '000000', size: [36, 30, 26, 24, 22, 22][index] },
        paragraph: { spacing: { before: 240, after: 140 }, keepNext: true, outlineLevel: index },
      })),
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
          },
        },
        children: children.length ? children : [new Paragraph('')],
      },
    ],
  });
  return { base64: await Packer.toBase64String(doc), warnings: [...warnings] };
}
