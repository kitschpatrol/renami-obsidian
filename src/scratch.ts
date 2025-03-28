import path from 'node:path'

export function removeExtension(fileName: string): string {
	console.log(path.extname(fileName))
	return path.join(path.dirname(fileName), path.basename(fileName, path.extname(fileName)))
}

console.log(removeExtension('/what/the/test.txt'))
