export function shortestUniquePathLabels(paths: Iterable<string>): Map<string, string> {
	const uniquePaths = Array.from(new Set(paths));
	const parts = new Map(uniquePaths.map(path => [path, path.split('/')]));
	const depths = new Map(uniquePaths.map(path => [path, 1]));

	while (true) {
		const groups = new Map<string, string[]>();
		for (const path of uniquePaths) {
			const segments = parts.get(path) ?? [path];
			const depth = depths.get(path) ?? 1;
			const label = segments.slice(-depth).join('/');
			const group = groups.get(label) ?? [];
			group.push(path);
			groups.set(label, group);
		}

		let expanded = false;
		for (const group of groups.values()) {
			if (group.length < 2) continue;
			for (const path of group) {
				const depth = depths.get(path) ?? 1;
				const length = parts.get(path)?.length ?? 1;
				if (depth < length) {
					depths.set(path, depth + 1);
					expanded = true;
				}
			}
		}
		if (!expanded) break;
	}

	return new Map(uniquePaths.map(path => {
		const segments = parts.get(path) ?? [path];
		return [path, segments.slice(-(depths.get(path) ?? 1)).join('/')];
	}));
}
