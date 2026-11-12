import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import { jeoPostEffectDefinitions } from "@/jeo/post-fx";

const defaultEffects = [blurEffectDefinition, ...jeoPostEffectDefinitions];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}
