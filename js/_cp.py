# -*- coding: utf-8 -*-
import sys
content = open(sys.argv[1], 'r', encoding='utf-8').read()
with open(sys.argv[2], 'w', encoding='utf-8') as f:
    f.write(content)
print('Copied', len(content), 'bytes')
