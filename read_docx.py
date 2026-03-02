import zipfile
import xml.etree.ElementTree as ET
import sys
import os

def read_docx(file_path, output_path):
    try:
        with zipfile.ZipFile(file_path) as z:
            xml_content = z.read('word/document.xml')
        
        tree = ET.fromstring(xml_content)
        
        # XML namespace for Word documents
        namespaces = {
            'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
        }
        
        text = []
        # Find all paragraph elements
        for p in tree.findall('.//w:p', namespaces):
            p_text = []
            # Find all run elements within the paragraph
            for r in p.findall('.//w:r', namespaces):
                # Find text elements within the run
                for t in r.findall('.//w:t', namespaces):
                    if t.text:
                        p_text.append(t.text)
            text.append(''.join(p_text))
            
        full_text = '\n'.join(text)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(full_text)
            
        print(f"Successfully wrote content to {output_path}")
        return True
    except Exception as e:
        print(f"Error reading .docx file: {str(e)}")
        return False

if __name__ == "__main__":
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
        output_path = "docx_content.txt"
        read_docx(file_path, output_path)
    else:
        print("Please provide a file path")
