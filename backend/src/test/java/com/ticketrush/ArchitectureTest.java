package com.ticketrush;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.library.Architectures.layeredArchitecture;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/** Layering rules inside each feature module. They fail the build when someone takes a shortcut. */
@AnalyzeClasses(packages = "com.ticketrush", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

	@ArchTest
	static final ArchRule layersPointInward = layeredArchitecture().consideringOnlyDependenciesInLayers()
			.layer("Api").definedBy("..api..")
			.layer("Application").definedBy("..application..")
			.layer("Domain").definedBy("..domain..")
			.layer("Infrastructure").definedBy("..infrastructure..")
			.whereLayer("Api").mayNotBeAccessedByAnyLayer()
			.whereLayer("Infrastructure").mayNotBeAccessedByAnyLayer()
			.whereLayer("Application").mayOnlyBeAccessedByLayers("Api", "Infrastructure")
			.whereLayer("Domain").mayOnlyBeAccessedByLayers("Api", "Application", "Infrastructure");

	@ArchTest
	static final ArchRule featureModulesHaveNoCycles = slices().matching("com.ticketrush.(*)..")
			.should().beFreeOfCycles();

	@ArchTest
	static final ArchRule domainKnowsNothingAboutWebOrSecurity = noClasses().that().resideInAPackage("..domain..")
			.should().dependOnClassesThat().resideInAnyPackage("org.springframework.web..", "org.springframework.security..");

}
