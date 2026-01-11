import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const onboarding = () => {
  return (
    <View>
      <Text>onboarding</Text>
      <TouchableOpacity className="w-full border border-purple-600 py-4 rounded-full">
        <Text className="text-purple-600 text-center font-semibold text-lg">
          Log In
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default onboarding;
