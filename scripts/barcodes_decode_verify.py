"""Optional independent decode: pip install zxing-cpp Pillow pypdf; run browser QA first.
Rasterize: pdftoppm -r 300 -png /tmp/confetti-labels.pdf /tmp/confetti-sheet
"""
from pathlib import Path
from PIL import Image
from pypdf import PdfReader
import zxingcpp

root = Path('/tmp')
pdf = PdfReader(root / 'confetti-labels.pdf')
assert len(pdf.pages) == 2
for page in pdf.pages:
    assert abs(float(page.mediabox.width) - 612) < .1
    assert abs(float(page.mediabox.height) - 792) < .1
for name in ['confetti-label.png', 'confetti-label-384.png', 'confetti-label-576.png']:
    image = Image.open(root / name)
    assert [r.text for r in zxingcpp.read_barcodes(image)] == ['CF00000001'], name
    print('Decoded', name, image.size)
# Decode each slot: whole-page decoders can merge repeated identical barcodes.
for page_index, file in enumerate(sorted(root.glob('confetti-sheet-*.png'))):
    image = Image.open(file)
    sx, sy = image.width / 215.9, image.height / 279.4
    for slot in range(12 if page_index == 0 else 2):
        x, y = 12 + (slot % 2) * 98, 10 + (slot // 2) * 43
        crop = image.crop((round(x*sx), round(y*sy), round((x+92)*sx), round((y+40)*sy)))
        expected = '0012345' if page_index == 1 and slot == 1 else 'CF00000001'
        assert [r.text for r in zxingcpp.read_barcodes(crop)] == [expected], (page_index, slot)
print('PASS independent ZXing: PNG at 1000/384/576px and all 14 labels on 2 letter PDF pages.')
