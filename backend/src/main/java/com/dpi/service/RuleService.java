package com.dpi.service;

import com.dpi.model.Rule;
import com.dpi.model.RuleType;
import com.dpi.rules.RuleEngine;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Collection;

/**
 * RuleService — CRUD for filtering rules, delegating to RuleEngine.
 */
@Service
@RequiredArgsConstructor
public class RuleService {

    private final RuleEngine ruleEngine;

    public Rule addRule(RuleType type, String value, String description) {
        Rule rule = Rule.builder()
                .type(type)
                .value(value)
                .description(description)
                .build();
        ruleEngine.addRule(rule);
        return rule;
    }

    public boolean removeRule(String id) {
        return ruleEngine.removeRule(id);
    }

    public Collection<Rule> getAllRules() {
        return ruleEngine.getAllRules();
    }
}
